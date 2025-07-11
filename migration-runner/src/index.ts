import { exec } from 'child_process'
import util from 'util'
import { PrismaClient } from '@prisma/client'

const execShellCommand = util.promisify(exec)
const prisma = new PrismaClient()

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function checkDbReady() {
  while (true) {
    try {
      await prisma.$queryRaw`SELECT 1`
      console.log('DB is ready')
      break
    } catch (err) {
      console.log('Waiting for DB...')
      await wait(1000)
    }
  }
}

async function run() {
  await checkDbReady()

  try {
    const { stdout, stderr } = await execShellCommand('npm run prisma:deploy')
    console.log(stdout)
    if (stderr) console.error(stderr)
  } catch (e: any) {
    console.error('Error running migrations:', e)
    process.exit(1)
  }

  await prisma.$disconnect()
}

run()
