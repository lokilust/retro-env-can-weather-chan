#!/bin/bash

# Defining Colors for text output
yellow=$( tput setaf 3 );
green=$( tput setaf 2 );
normal=$( tput sgr 0 );
cyan=$(tput setaf 6);

# Discussion, issues and change requests at:
#   https://github.com/nodesource/distributions
#
# Script to install the NodeSource Node.js 16.x repo onto a
# Debian or Ubuntu system.
#
# Run as root or insert `sudo -E` before `bash`:
#
# Using Ubuntu
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

## Using Debian, as root
#curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
#apt-get install -y nodejs

    echo "${green}================================================================================${normal}"
    echo -e "${normal}\nInstall of node and Yarn package manager is complete.${normal}"
    echo "${green}================================================================================${normal}"
    echo -e "\nVersion of Node.js installed is${yellow}"
node -v
    echo "${green}================================================================================${normal}"
    echo -e "${normal}Installed Yarn package manager${cyan}"
npm info yarn version
    echo -e "${normal}"
    echo "${green}================================================================================${normal}"
    echo -e "To compile and install native addons from npm you may also need to install build tools"
    read -p "If you would like it install the native addons, Press [Enter] to continue.
If you don't want to continue press Ctrl-C to abort."

#Optional: install build tools
#To compile and install native addons from npm you may also need to install build tools:
    
## use `sudo` on Ubuntu or run this as root on debian
##sudo apt-get install -y build-essential

    echo -e "${green}\nInstall is complete.${normal}"
    echo -e "${cyan}Have fun building${normal}"
exit
