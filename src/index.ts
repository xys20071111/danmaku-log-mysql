import fs from 'fs';
import { EventEmitter } from 'events';
import mysql from 'mysql';
import { WebSocket } from 'ws';

interface IConfig {
	apiPort: number
	username: string
	password: string
	host: string
	port: number
	db: string
	token: string
}

interface Message {
	cmd: string
	data: any
}

const config: IConfig = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let db = mysql.createPool({
	host: config.host,
	port: config.port,
	user: config.username,
	password: config.password,
	database: config.db,
	connectionLimit: 20
	
});
const reconnectFunction = () => {
	console.log('[弹幕日志插件] 与数据库连接断开，正在重连')
	db = mysql.createPool({
		host: config.host,
		port: config.port,
		user: config.username,
		password: config.password,
		database: config.db,

	});
}
db.on('error', reconnectFunction)
db.on('close', reconnectFunction)

db.query('CREATE TABLE IF NOT EXISTS`log` ( `id` INT NOT NULL AUTO_INCREMENT , `time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP , `roomId` INT NOT NULL , `uid` BIGINT UNSIGNED NOT NULL , `nickname` VARCHAR(255) NOT NULL , `text` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`)) ENGINE = InnoDB;');
let danmaku = new WebSocket(`ws://127.0.0.1:${config.apiPort}`)
const APIMsgHandler = new EventEmitter();

function registerCallback() {
	danmaku.on('message', (rawData: string) => {
		try {
			const msg: Message = JSON.parse(rawData)
			APIMsgHandler.emit(msg.cmd, msg.data)
		} catch (e) {
			console.log(e)
		}
	});
	danmaku.on('open', () => {
		danmaku.send(JSON.stringify({ cmd: "AUTH", data: config.token }));
	});
	danmaku.on('error', () => {
		danmaku = new WebSocket(`ws://127.0.0.1:${config.apiPort}`)
		registerCallback()
	})
	danmaku.on('close', () => {
		danmaku = new WebSocket(`ws://127.0.0.1:${config.apiPort}`)
		registerCallback()
	})
}
registerCallback()

APIMsgHandler.on('AUTH', (result: string) => {
	if (result === 'AUTHED') {
		danmaku.send(JSON.stringify({ cmd: "ROOMID", data: config.token }));
	} else {
		console.log('[弹幕日志插件] 认证失败');
	}
})

APIMsgHandler.on('ROOMID', (roomId: number) => {
	console.log(`[弹幕日志插件] 工作在${roomId}`);
	APIMsgHandler.on('DANMU_MSG',(data) => {
		db.query('INSERT INTO `log`(`roomId` ,`uid`, `nickname`, `text`) VALUES(?, ?, ?, ?)', [roomId, data[2][0], data[2][1], data[1]]);
	});
})