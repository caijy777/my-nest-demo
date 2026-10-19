import { Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createPostDto: CreatePostDto) {
    const post = await this.prismaService.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        published: createPostDto.published??false,//不传默认是false
        authorId: createPostDto.authorId,
      },
    });
    return {
        success: true,
        message: 'Post created successfully',
        data: post,
    }
  }
}
