// 复用 Prisma Client 查询已有的 users 表

import { Pool } from 'pg';
import 'dotenv/config';

// MCP Server 是独立进程，需要自己初始化 Prisma
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function handleDatabaseQuery(args: any): Promise<string> {
  const { name, role, limit = 5 } = args;

  // 构建查询条件
  const conditions: string[] = [];
  if (name) {
    conditions.push(`name LIKE '%${name}%'`);
  }
  if (role) {
    conditions.push(`role = '${role}'`);
  }
  const query = `
        SELECT id, name, email, role FROM users
        ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
        LIMIT ${Math.min(Number(limit), 20)}
    `;
  const res = await pool.query(query);
  const users = res.rows;

  if (!users.length) {
    return '未找到符合条件的用户';
  }

  // 格式化为易读的文本（LLM 会基于这个文本回答用户）
  const userList = users
    .map(
      (u, i) =>
        `${i + 1}. ${u.name}（ID: ${u.id}，邮箱: ${u.email}，角色: ${u.role}）`,
    )
    .join('\n');

  return `找到 ${users.length} 个用户：\n${userList}`;
}
