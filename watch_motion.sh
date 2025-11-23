#!/bin/bash
while true; do
    scp -q shantanubal@192.168.0.129:~/latest_motion.jpg ~/Desktop/latest_motion.jpg 2>/dev/null
    if [ -f ~/Desktop/latest_motion.jpg ]; then
        open -a Preview ~/Desktop/latest_motion.jpg
    fi
    sleep 2  # Check every 2 seconds
done
