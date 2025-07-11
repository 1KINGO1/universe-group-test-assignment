import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger as PinoLogger } from 'nestjs-pino'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: false,
  })

  app.enableShutdownHooks()
  app.useLogger(app.get(PinoLogger))

  await app.listen(3000)
}
bootstrap()
