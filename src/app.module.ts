import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { PostModule } from './post/post.module';
import { ConfigModule } from '@nestjs/config';
import { ModelsModule } from './models/models.module';
import { PromptsModule } from './prompts/prompts.module';
import { ChainsModule } from './chains/chains.module';
import { MemoryModule } from './memory/memory.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [UserModule, PrismaModule, PostModule, ConfigModule.forRoot({isGlobal:true}), ModelsModule, PromptsModule, ChainsModule, MemoryModule, RagModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
