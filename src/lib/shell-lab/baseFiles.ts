// Rocky Linux 8.8 이미지(rockylinux:8.8)에서 그대로 가져온 기본 파일 내용. scripts/shell-lab 로 확인할 수 있다.
export const BASE_FILE_TEXT: Record<string, string> = {
  "/etc/skel/.bash_logout": "# ~/.bash_logout\n\n",
  "/etc/skel/.bash_profile": "# .bash_profile\n\n# Get the aliases and functions\nif [ -f ~/.bashrc ]; then\n\t. ~/.bashrc\nfi\n\n# User specific environment and startup programs\n",
  "/etc/skel/.bashrc": "# .bashrc\n\n# Source global definitions\nif [ -f /etc/bashrc ]; then\n\t. /etc/bashrc\nfi\n\n# User specific environment\nif ! [[ \"$PATH\" =~ \"$HOME/.local/bin:$HOME/bin:\" ]]\nthen\n    PATH=\"$HOME/.local/bin:$HOME/bin:$PATH\"\nfi\nexport PATH\n\n# Uncomment the following line if you don't like systemctl's auto-paging feature:\n# export SYSTEMD_PAGER=\n\n# User specific aliases and functions\n",
  "/root/.bash_logout": "# ~/.bash_logout\n\n",
  "/root/.bash_profile": "# .bash_profile\n\n# Get the aliases and functions\nif [ -f ~/.bashrc ]; then\n\t. ~/.bashrc\nfi\n\n# User specific environment and startup programs\n\nPATH=$PATH:$HOME/bin\n\nexport PATH\n",
  "/root/.bashrc": "# .bashrc\n\n# User specific aliases and functions\n\nalias rm='rm -i'\nalias cp='cp -i'\nalias mv='mv -i'\n\n# Source global definitions\nif [ -f /etc/bashrc ]; then\n\t. /etc/bashrc\nfi\n",
  "/root/.cshrc": "# .cshrc\n\n# User specific aliases and functions\n\nalias rm 'rm -i'\nalias cp 'cp -i'\nalias mv 'mv -i'\n",
  "/root/.tcshrc": "# .tcshrc\n\n# User specific aliases and functions\n\nalias rm 'rm -i'\nalias cp 'cp -i'\nalias mv 'mv -i'\n\nset prompt='[%n@%m %c]# '\n\n",
};
