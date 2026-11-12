import { Controller, Post, Body } from '@nestjs/common';
import { FunctionCallingService } from './function-calling.service';

@Controller('function-calling')
export class FunctionCallingController {
    constructor(private readonly fcService: FunctionCallingService) {}

    @Post('run')
    runFunctionCalling(@Body() body:{message:string}){
        return this.fcService.runFunctionCalling(body.message);
    }
}
