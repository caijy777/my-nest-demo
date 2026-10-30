import { Controller, Post, Body } from '@nestjs/common';
import { ChainsService } from './chains.service';

@Controller('chains')
export class ChainsController {
    constructor(private readonly chainsService: ChainsService) {}
    // 润色文章
    @Post('polish')
    polish(@Body() body: { article: string }) {
        return this.chainsService.polish(body.article);
    }
    // 生成博客
    @Post('blog')
    generateBlog(@Body() body: { keywords:string, style:string }) {
        return this.chainsService.generateBlog(body.keywords, body.style);
    }
    // 条件链
    @Post('smart-router')
    smartRouter(@Body() body: { question:string }) {
        return this.chainsService.smartRouter(body.question);
    }
}
