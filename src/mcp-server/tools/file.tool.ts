import * as fs from 'fs'
import * as path from 'path'

// 安全根目录（只允许读写这个目录下的文件）
// 返回 进程的工作目录 ——你在哪个目录敲命令启动的进程，它就是哪个。 注意是"启动目录"，不是"脚本所在目录" 。
const SAFE_ROOT = process.cwd()

function resolveSafePath(filePath: string): string {
  // 防止路径穿越攻击（如 ../../etc/passwd）
  // 把用户传入的`filePath` 拼到`SAFE_ROOT` 上，并规范化成一个绝对路径 。规范化过程会处理`..` 、`.` 、多余斜杠。
  const resolved = path.resolve(SAFE_ROOT, filePath)

  // 用 path.relative 计算相对路径：
  //   - 以 '..' 开头 → 跳出了 SAFE_ROOT
  //   - 是绝对路径   → resolved 与 SAFE_ROOT 在不同盘符（Windows 场景）
  const rel = path.relative(SAFE_ROOT, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`不允许访问项目目录外的文件：${filePath}`)
  }
  return resolved
}

export async function handleFileOperation(
  operation: 'read' | 'write',
  args: any,
): Promise<string> {
  if (operation === 'read') {
    const { path: filePath } = args
    const fullPath = resolveSafePath(filePath)

    if (!fs.existsSync(fullPath)) {
      return `文件不存在：${filePath}`
    }

    const stat = fs.statSync(fullPath)
    if (stat.size > 100 * 1024) {
      // 文件超过 100KB，只返回前 2000 字符
      const content = fs.readFileSync(fullPath, 'utf-8')
      return `文件较大，只返回前 2000 字符：\n\n${content.slice(0, 2000)}\n\n...(文件共 ${stat.size} 字节)`
    }

    const content = fs.readFileSync(fullPath, 'utf-8')
    return `文件内容（${filePath}）：\n\n${content}`
  }

  if (operation === 'write') {
  const { path: filePath, content } = args
  const fullPath = resolveSafePath(filePath)

  // 确保目录存在
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })

  // 追加写入（不覆盖）
  fs.appendFileSync(fullPath, content, 'utf-8')
  return `已成功写入 ${content.length} 个字符到 ${filePath}`
}

throw new Error(`不支持的操作：${operation}`)
}