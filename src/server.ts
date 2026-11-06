import { buildApp } from "./app.js"


async function start(){
    const app = buildApp()
    const port = Number(process.env.PORT ?? 3000)


    try{
        await app.listen({
            port,
            host: '0.0.0.0'
        })
    }catch(error){
        app.log.error(error)
        process.exit(1)
    }
}


start()