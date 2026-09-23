/**
 * pgStore.js — PostgreSQL 长期记忆存储后端模块
 * ============================================================
 * 为 LangGraph.js BaseStore 提供后端持久化支持。
 * 浏览器无法直接连接 PostgreSQL，通过 server.js REST API 代理调用。
 *
 * 数据表结构：langgraph_store
 *   - namespace   text[]      分层命名空间（如 ['tenant-001', 'users', 'user-001']）
 *   - key         text        命名空间内唯一标识
 *   - value       jsonb       存储的数据对象
 *   - created_at  timestamptz 创建时间
 *   - updated_at  timestamptz 更新时间
 *
 * REST API 端点（由 server.js 暴露）：
 *   POST /api/store/get     — 获取单个 item
 *   POST /api/store/put     — 存储/更新 item
 *   POST /api/store/search — 搜索 items
 *   POST /api/store/delete — 删除 item
 * ============================================================
 */
const { Pool } = require('pg')

// PostgreSQL 连接配置
const PG_CONNECTION_STRING =
  process.env.PG_CONNECTION_STRING ||
  'postgresql://langgraph_user:123456@localhost:5432/langgraph_db?sslmode=disable'

// 连接池（懒加载，首次调用时创建）
let _pool = null

/**
 * 获取 PG 连接池
 */
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: PG_CONNECTION_STRING,
      max: 5, // 最大连接数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    console.log('[PGStore] 连接池已创建:', PG_CONNECTION_STRING.replace(/:[^:@]+@/, ':****@'))
  }
  return _pool
}

/**
 * 初始化数据库表
 * 在 server.js 启动时调用
 */
async function initStoreTable() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS langgraph_store (
        namespace   text[]    NOT NULL,
        key         text      NOT NULL,
        value       jsonb     NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (namespace, key)
      )
    `)
    // 创建 GIN 索引用于 namespace 前缀搜索
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_langgraph_store_namespace
      ON langgraph_store USING GIN (namespace)
    `)
    // 创建 updated_at 索引用于排序
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_langgraph_store_updated
      ON langgraph_store (updated_at DESC)
    `)
    console.log('[PGStore] 数据表 langgraph_store 已就绪')
  } finally {
    client.release()
  }
}

/**
 * 获取单个 item
 * GET 操作
 */
async function getItem(namespace, key) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await client.query(
      `SELECT namespace, key, value, created_at, updated_at
        FROM langgraph_store
        WHERE namespace = $1::text[] AND key = $2
        LIMIT 1`,
      [namespace, key]
    )
    if (result.rows.length === 0) return null
    const row = result.rows[0]
    return {
      namespace: row.namespace,
      key: row.key,
      value: row.value,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } finally {
    client.release()
  }
}

/**
 * 存储/更新 item
 * PUT 操作（value 为 null 时删除）
 */
async function putItem(namespace, key, value) {
  // value === null 表示删除
  if (value === null) {
    return deleteItem(namespace, key)
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO langgraph_store (namespace, key, value, created_at, updated_at)
        VALUES ($1::text[], $2, $3, now(), now())
        ON CONFLICT (namespace, key)
        DO UPDATE SET value = $3, updated_at = now()`,
      [namespace, key, JSON.stringify(value)]
    )
    return { success: true }
  } finally {
    client.release()
  }
}

/**
 * 删除 item
 */
async function deleteItem(namespace, key) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `DELETE FROM langgraph_store WHERE namespace = $1::text[] AND key = $2`,
      [namespace, key]
    )
    return { success: true }
  } finally {
    client.release()
  }
}

/**
 * 搜索 items（按 namespace 前缀）
 */
async function searchItems(namespacePrefix, options = {}) {
  const { filter = null, limit = 10, offset = 0 } = options
  const pool = getPool()
  const client = await pool.connect()
  try {
    // 使用 namespace 前缀匹配
    let query = `
      SELECT namespace, key, value, created_at, updated_at
      FROM langgraph_store
      WHERE namespace = $1::text[]
    `
    const params = [namespacePrefix]

    // 支持 filter（jsonb 字段过滤）
    if (filter && typeof filter === 'object') {
      let filterIdx = 1
      const filterClauses = []
      for (const [field, val] of Object.entries(filter)) {
        filterIdx++
        filterClauses.push(`value->>$${filterIdx} = $${filterIdx + 1}`)
        params.push(field, String(val))
      }
      if (filterClauses.length > 0) {
        query += ' AND ' + filterClauses.join(' AND ')
      }
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await client.query(query, params)

    return result.rows.map((row) => ({
      namespace: row.namespace,
      key: row.key,
      value: row.value,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  } finally {
    client.release()
  }
}

/**
 * 删除指定 namespace 前缀下的所有 items
 */
async function deleteByNamespace(namespacePrefix) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await client.query(
      `DELETE FROM langgraph_store WHERE namespace = $1::text[]`,
      [namespacePrefix]
    )
    return { success: true, deleted: result.rowCount }
  } finally {
    client.release()
  }
}

/**
 * 关闭连接池
 */
async function closePool() {
  if (_pool) {
    await _pool.end()
    _pool = null
    console.log('[PGStore] 连接池已关闭')
  }
}

module.exports = {
  getPool,
  initStoreTable,
  getItem,
  putItem,
  deleteItem,
  searchItems,
  deleteByNamespace,
  closePool,
}
