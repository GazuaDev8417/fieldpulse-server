import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'



const connectionString = process.env.DATABASE_URL

if(!connectionString){
    throw new Error('DATABASE_URL is required')
}

declare global {
    var prisma: PrismaClient | undefined
}

const adapter = new PrismaPg({ connectionString })


export const prisma = 
    global.prisma ??
    new PrismaClient({
        adapter,
        log:
            process.env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error']
    })

if(process.env.NODE_ENV !== 'production'){
    global.prisma = prisma
}