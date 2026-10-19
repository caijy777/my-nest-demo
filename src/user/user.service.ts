import { Injectable } from '@nestjs/common';
// import { User } from './use';
import { MailService } from './mail.server';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UserService {
  // service里做具体业务逻辑：如调第三方api，查询数据库，处理数据等
  // 还可以在service里调用其他service

  constructor(private readonly mailService: MailService, private readonly prismaService: PrismaService) {}

  // private users:User[]=[
  //   {id:1, name:'张三', age:18, email:'1234567890@qq.com'},
  //   {id:2, name:'李四', age:20, email:'1234567890@qq.com'},
  //   {id:3, name:'王五', age:22, email:'1234567890@qq.com'},
  // ]

  // getUser():string{
  //   return 'this is user service';
  // }

  async addUser(createUserDto: CreateUserDto){
    const user=await this.prismaService.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: createUserDto.password,
        role: createUserDto.role || 'user',//默认角色是user
      }
    })

    return {success:true, message:`用户${createUserDto.name}创建成功`, data:user}
  }
  async getUserList(){
    // const users=await this.prismaService.user.findMany()//查询所有字段
    // 查询部分字段, 还可以排序
    const users=await this.prismaService.user.findMany({
      select:{
        id:true,
        name:true,
        email:true,
        role:true,
        createdAt:true,
        updatedAt:true,
      },
      orderBy:{
        createdAt:'desc',
      }
    })

    return {success:true, message:'用户列表查询成功', data:users}
  }
  async getUserById(id:string){
    const user=await this.prismaService.user.findUnique({
      where:{
        id: Number(id),
      },
      select:{
        id:true,
        name:true,
        email:true,
        role:true,
        createdAt:true,
        updatedAt:true,
        // 关联查询，查询用户的所有文章
        posts:{//这里的posts字段名字和schema.prisma line:38名字对应
          select:{
            id:true,
            title:true,
            content:true,
            published:true,
            createdAt:true,
            updatedAt:true,
            authorId:true
          },
        },
      },
    })
    if(user){
      return {success:true, message:`用户${id}查询成功`, data:user}
    }
    return {success:false, message:`用户${id}不存在`, data:null}
  }
  deleteUser(id:string){
    return this.prismaService.user.delete({
      where:{
        id: Number(id),
      },
    }).then(()=>{
      return {success:true, message:`用户${id}删除成功`, data:null}
    }).catch(()=>{
      return {success:false, message:`用户${id}不存在`, data:null}
    })
  }
  updateUser(id:string, updateUserDto: UpdateUserDto){
    return this.prismaService.user.update({
      where:{
        id: Number(id),
      },
      data: {
        name: updateUserDto.name,
        email: updateUserDto.email,
        password: updateUserDto.password,
        role: updateUserDto.role,
      },
    }).then(()=>{
      return {success:true, message:`用户${id}更新成功`, data:null}
    }).catch(()=>{
      return {success:false, message:`用户${id}不存在`, data:null}
    })
  }

  // GET /user/search //只查第一页，每页10条数据
  // GET /user/search?page=2&size=5 //查第二页，每页5条数据
  // GET /user/search?name=james //按用户名查询
  // GET /user/search?role=user //按用户角色查询
  // GET /user/search?page=1&size=10&name=james2&role=user // 组合查询

  async searchUser(query: QueryUserDto){
    const { name, role, page=1, size=10 } = query
    const where:any = {}
    if(name){
      where.name = { contains: name, mode: 'insensitive' }
    }
    if(role){
      where.role = role
    }
    // 确保 page 和 size 是数字类型（查询参数传入的是字符串）
    const pageNum = Number(page) || 1
    const pageSize = Number(size) || 10

    // users是查询结果（当前页数据），total是总条数
    // 需要用事务来确保数据的一致性，即同时查询总条数和当前页数据
    const [total, users] = await this.prismaService.$transaction([
      this.prismaService.user.count({ where }),
      this.prismaService.user.findMany({
        where,
        select:{//返回字段过滤，不返回密码这类敏感字段
          id:true,
          name:true,
          email:true,
          role:true,
          createdAt:true,
          updatedAt:true,
        },
        skip: (pageNum-1)*pageSize, //跳过(page-1)*size条数据，从第page*size条数据开始取
        take: pageSize, //取size条数据
        orderBy:{//排序，按创建时间降序
          createdAt:'desc',
        },
      }),
    ])

    const totalPage=Math.ceil(total/pageSize)
    return {
      pagination:{
        total,
        currentPage:pageNum,
        pageSize,
        totalPage,
        hasPrevPage: pageNum>1,
        hasNextPage: pageNum<totalPage,
      },
      data: users//当前页数据
    }

  }

  searchUser1(query: QueryUserDto){
    const { name, role, page=1, size=10 } = query
    // 确保 page 和 size 是数字类型（查询参数传入的是字符串）
    const pageNum = Number(page) || 1
    const pageSize = Number(size) || 10
    return this.prismaService.user.findMany({
      where:{
        name: name?{contains: name}:undefined,
        role: role || undefined,
      },
      skip: (pageNum-1)*pageSize, //跳过(page-1)*size条数据，从第page*size条数据开始取
      take: pageSize, //取size条数据
      orderBy:{//排序，按创建时间降序
        createdAt:'desc',
      },
    }).then((users)=>{
      return {success:true, message:'用户列表查询成功', data:users, total:users.length}
    }).catch((err)=>{
      console.error('用户列表查询失败:', err)
      return {success:false, message:'用户列表查询失败', data:null}
    })
  }

/*   createUser(user: User){
    this.mailService.sendMail({
      to: user.email,
      subject: '欢迎注册',
      text: `你好${user.name}，欢迎注册我们的服务`,
    });
    // 实际业务是调用数据库，创建用户，返回用户信息 insert into user (name, age, email) values (?, ?, ?)
    return {
      success:true,
      message:`用户${user.name}创建成功`,
      data:{
        id: user.id,
        name: user.name,
        age:user.age,
        email: user.email
      }
    }
  }
  getUserById(id:string){
    // 实际业务是调用数据库，查询用户，返回用户信息 select * from user where id = ?
    return {
      success:true,
      message:`用户${id}查询成功`,
      data:{
        id: Number(id),
        name: '张三',
        age:18,
        email:'1234567890@qq.com'
      }
    }
  }
  getList(page:number, size:number){
    // 实际业务是调用数据库，查询用户列表，返回用户列表信息 select * from user limit ?, ?
    return {
      success:true,
      message:`用户列表查询成功`,
      data:{
        list: this.users,
        total:3,
        page:page,
        size:size
      }
    }
  }
  updateUser(id:string, user:User){
    // 实际业务是调用数据库，更新用户信息，返回用户信息 update user set name = ?, age = ?, email = ? where id = ?

    let index = this.users.findIndex(u=>u.id===Number(id))
    if(index===-1){
      return {
        success:false,
        message:`用户${id}不存在`,
        data:null
      }
    }
    return {
      success:true,
      message:`用户${id}更新成功`,
      data:{
        id: Number(id),
        name: user.name||this.users[index].name,//传了新名字就用新的，没传说明没修改就用原来的，下面同理
        age:user.age||this.users[index].age,
        email:user.email||this.users[index].email
      }
    }
  }
  deleteUser(id:string){
    // 实际业务是调用数据库，删除用户信息，返回用户信息 delete from user where id = ?
    let index = this.users.findIndex(u=>u.id===Number(id))
    if(index===-1){
      return {
        success:false,
        message:`用户${id}不存在`,
        data:null
      }
    }
    this.users.splice(index,1)
    return {
      success:true,
      message:`用户${id}删除成功`,
      data:null
    }
  } */
}
