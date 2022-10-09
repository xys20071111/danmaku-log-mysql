"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const events_1 = require("events");
const mysql_1 = __importDefault(require("mysql"));
const ws_1 = require("ws");
const config = JSON.parse(fs_1.default.readFileSync(process.argv[2], 'utf8'));
let db = mysql_1.default.createPool({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.db,
    connectionLimit: 20
});
const reconnectFunction = () => {
    console.log('[弹幕日志插件] 与数据库连接断开，正在重连');
    db = mysql_1.default.createPool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.db,
    });
};
db.on('error', reconnectFunction);
db.on('close', reconnectFunction);
db.query('CREATE TABLE IF NOT EXISTS`log` ( `id` INT NOT NULL AUTO_INCREMENT , `time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP , `roomId` INT NOT NULL , `uid` BIGINT UNSIGNED NOT NULL , `nickname` VARCHAR(255) NOT NULL , `text` VARCHAR(255) NOT NULL , PRIMARY KEY (`id`)) ENGINE = InnoDB;');
let danmaku = new ws_1.WebSocket(`ws://127.0.0.1:${config.apiPort}`);
const APIMsgHandler = new events_1.EventEmitter();
function registerCallback() {
    danmaku.on('message', (rawData) => {
        try {
            const msg = JSON.parse(rawData);
            APIMsgHandler.emit(msg.cmd, msg.data);
        }
        catch (e) {
            console.log(e);
        }
    });
    danmaku.on('open', () => {
        danmaku.send(JSON.stringify({ cmd: "AUTH", data: config.token }));
    });
    danmaku.on('error', () => {
        danmaku = new ws_1.WebSocket(`ws://127.0.0.1:${config.apiPort}`);
        registerCallback();
    });
    danmaku.on('close', () => {
        danmaku = new ws_1.WebSocket(`ws://127.0.0.1:${config.apiPort}`);
        registerCallback();
    });
}
registerCallback();
APIMsgHandler.on('AUTH', (result) => {
    if (result === 'AUTHED') {
        danmaku.send(JSON.stringify({ cmd: "ROOMID", data: config.token }));
    }
    else {
        console.log('[弹幕日志插件] 认证失败');
    }
});
APIMsgHandler.on('ROOMID', (roomId) => {
    console.log(`[弹幕日志插件] 工作在${roomId}`);
    APIMsgHandler.on('DANMU_MSG', (data) => {
        db.query('INSERT INTO `log`(`roomId` ,`uid`, `nickname`, `text`) VALUES(?, ?, ?, ?)', [roomId, data[2][0], data[2][1], data[1]]);
    });
});
