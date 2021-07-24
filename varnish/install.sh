#!/usr/bin/env bash
yum install varnish -y
yum install nginx -y

chkconfig varnish on
chkconfig nginx on

sed -i 's/VARNISH_LISTEN_PORT=6081/VARNISH_LISTEN_PORT=80/' /etc/sysconfig/varnish
mv /tmp/user-data/varnish_default.vcl /etc/varnish/default.vcl
mv /tmp/user-data/nginx.conf /etc/nginx/nginx.conf

service varnish start
service nginx start
