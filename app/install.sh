#!/usr/bin/env bash
amazon-linux-extras install epel

yum install nginx -y
yum install awslogs -y
yum install amazon-cloudwatch-agent -y

systemctl enable nginx.service
systemctl enable awslogsd.service
systemctl enable amazon-cloudwatch-agent.service

cp -rf /tmp/user-data/public/* /usr/share/nginx/html/
mv /tmp/user-data/amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
cat /tmp/user-data/crontab.txt >> /etc/crontab

systemctl start nginx.service
systemctl start awslogsd
systemctl start amazon-cloudwatch-agent.service
systemctl start crond.service
