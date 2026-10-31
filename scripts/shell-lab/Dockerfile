FROM rockylinux:8.8
# 기본 이미지에 없는 find·passwd 만 더한다. 나머지는 8.8 이미지 그대로.
RUN dnf install -y findutils passwd && dnf clean all
