import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  sendMail(mail: { to: string; subject: string; text: string }) {
    console.log(
      `发送邮件给${mail.to}，主题为${mail.subject}，内容为${mail.text}`,
    );
  }
}
