@echo off
cd /d "D:\Claude Homework\hackathon\Test Demo\Memex\resources\app"
node_modules\electron\dist\electron.exe . > "%TEMP%\electron_stdout.txt" 2> "%TEMP%\electron_stderr.txt"
