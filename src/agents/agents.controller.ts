import { Controller, Post, Body } from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
    constructor(private agentsService:AgentsService){}
    
    @Post('run')
    runAgent(@Body() body:{message:string}){
        return this.agentsService.runAgent(body.message);
    }
}
