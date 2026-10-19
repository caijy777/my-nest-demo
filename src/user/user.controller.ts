import { Controller, Get, Post, Body, Param, Query, Put, Delete } from '@nestjs/common';
import { UserService } from './user.service';
// import { User } from './use';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // @Get('getUser')
  // getUser():string{
  //   return this.userService.getUser();
  // }
  // 传递参数的方式有三种：路径参数、查询参数、请求体
  // 1、路径参数：是localhost:3000/user/123这类请求，id是路径参数
  // @Get('user/:id')
  // getUserById(@Param('id') id:string){
  //   return this.userService.getUserById(id)
  // }

  // 2.查询参数：是localhost:3000/user/list?page=1&size=10这类请求，page和size是查询参数，page是页码，size是每页条数
  // @Get('list')
  // getList(@Query('page') page:number, @Query('size') size:number){
  //   return this.userService.getList(page, size);
  // }

  // 3.请求体：是localhost:3000/user/addUser这类请求，请求体是用户信息，需要使用@Body装饰器来接收
  @Post('addUser')
  createUser(@Body() user: CreateUserDto){
    return this.userService.addUser(user);
  }

  @Get('getUserList')
  getUserList(){
    return this.userService.getUserList();
  }

  @Get('getUserById/:id')
  getUserById(@Param('id') id:string){
    return this.userService.getUserById(id);
  }

  // put请求，更新数据
  @Put('updateUser/:id')
  updateUser(@Param('id') id:string, @Body() user: UpdateUserDto){
    return this.userService.updateUser(id, user)
  }

  // delete请求，删除数据
  @Delete('deleteUser/:id')
  deleteUser(@Param('id') id:string){
    return this.userService.deleteUser(id)
  }

  @Get('search')
  searchUser(@Query() query: QueryUserDto){
    return this.userService.searchUser(query);
  }
}
