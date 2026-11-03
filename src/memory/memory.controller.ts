import { Controller,Body,Post, Get, Param, Delete, Res } from '@nestjs/common';
import { MemoryService } from './memory.service';
import type { Response } from 'express';

@Controller('memory')
export class MemoryController {
    constructor(private readonly memoryService: MemoryService) {}
    // 模拟会话历史
    @Post('chat')
    chat(@Body() body: {sessionId:string, message:string}){
        return this.memoryService.chat(body.sessionId, body.message);
    }
    // 查看会话历史
    @Get('history/:sessionId')
    getHistory(@Param('sessionId') sessionId: string){
        return this.memoryService.getHistory(sessionId)
    }
    // 清空会话历史
    @Delete('session/:sessionId')
    clearHistory(@Param('sessionId') sessionId: string){
        return this.memoryService.clearHistory(sessionId)
    }
    // 获取所有会话历史列表
    @Get('sessions')
    listSessions(){
        return this.memoryService.listSessions()
    }
    // 流式输出会话历史，打字机效果，不是json一次性返回
    @Post('chat-stream')
    chatStream(@Body() body: { sessionId: string; message: string }, @Res() res: Response) {
      return this.memoryService.chatStream(body.sessionId, body.message, res)
    }
}
