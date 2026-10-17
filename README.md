# natter-redirect

给 **Natter / natmap / 任何会变的 `IP:PORT`** 一个固定域名。

Cloudflare Worker + KV，一个文件，零依赖。访问 `https://your.domain` 会 302 到设备当前上报的地址，保留 path 和 query。

## 为什么需要它

Natter 通过 STUN 打洞拿到的公网端口，会随 PPPoE 重拨、CGNAT 映射回收而变化。DNS 只能存 IP，存不了端口，所以直接改 A 记录不够用。

这个 Worker 把「当前地址」当成一条数据存在 KV 里，域名只负责跳转：

```
设备 --POST /_nat/update--> Worker --KV--> 当前 IP:PORT
浏览器 --GET /--> Worker --302--> http://IP:PORT/...
```

## 文件

| 文件 | 说明 |
|---|---|
| `worker.js` | Worker 全部逻辑，单文件无依赖 |
| `wrangler.toml.example` | wrangler 配置模板 |
| `examples/notify.sh` | Natter `-e` 回调示例 |
| `LICENSE` | MIT |

## 部署

### 方式一：控制台

1. 打开 Cloudflare 控制台 → Workers & Pages → 创建 Worker
2. 粘贴 `worker.js`
3. 创建 KV namespace（比如 `natter-addr`），在 Worker 的 Settings → Variables 里绑定为 **KV**
4. 添加 Secret：名称 **SECRET**，值用一条长随机串（`openssl rand -hex 24`）
5. Settings → Domains & Routes → 添加自定义域名

### 方式二：wrangler

```bash
wrangler kv namespace create natter-addr   # 记下返回的 id
cp wrangler.toml.example wrangler.toml     # 填入 id 和你的域名
wrangler secret put SECRET                 # 粘贴一条长随机串
wrangler deploy
```

## 设备端怎么上报

任何能发 HTTPS 请求的东西都行：

```bash
curl -X POST https://nat.example.com/_nat/update \
     -H "x-auth: $SECRET" \
     --data "203.0.113.7:45678"
```

Natter 的 `-e` 回调会带 5 个参数：`<proto> <私网IP> <私网端口> <公网IP> <公网端口>`。改一下 `examples/notify.sh` 里的 `SITE` 和 `SECRET` 就能用：

```bash
cp examples/notify.sh .
vi notify.sh        # 填 SITE / SECRET
```

然后：

```bash
python3 natter.py -p 8080 -k 60 -q -e ./notify.sh
```

`-q` 让 Natter 在公网地址变化时退出，外面套一层循环重启即可。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/_nat/update` | 请求头 `x-auth: <SECRET>`，body 为 `IP:PORT`，写入 KV |
| GET | `/_nat/status` | 返回 `{"addr":"1.2.3.4:5678","ts":1700000000000}` |
| GET | `/*` | 302 到当前地址，保留 path 和 query；没上报过返回 503 |

## 注意

- **SECRET 泄露 = 别人能把你的域名指向任意 IP**。用长随机串，别复用。
- KV 是最终一致的，写入后各地生效有几秒延迟，属正常。
- 跳转目标是 `http://`，因为 Natter 穿的是裸 TCP，没有 TLS。要 HTTPS 得在设备侧自己加反代。
- Worker 的免费额度（10 万次/天）对这种用法绰绰有余。

## License

MIT
