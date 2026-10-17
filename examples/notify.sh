#!/bin/sh
# Natter 的 -e 回调：<proto> <私网IP> <私网端口> <公网IP> <公网端口>
# 用法：python3 natter.py -p 8080 -k 60 -q -e ./notify.sh
[ "$1" = "tcp" ] || exit 0

SITE="https://nat.example.com"
SECRET="改成你的 SECRET"

curl -s -m 10 -X POST "$SITE/_nat/update" \
     -H "x-auth: $SECRET" \
     --data "$4:$5"
