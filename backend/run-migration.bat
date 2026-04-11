@echo off
chcp 65001 >nul
title 盖可朋友圈 - 数据库迁移工具

echo.
echo ========================================
echo   盖可朋友圈 - 数据库迁移工具
echo ========================================
echo.
echo 正在连接 Supabase 数据库...
echo.

cd /d "%~dp0"

node run-migration.js

if %errorlevel% equ 0 (
    echo.
    echo ✅ 迁移成功完成！
    echo.
    echo 按任意键退出...
    pause >nul
) else (
    echo.
    echo ❌ 迁移失败！
    echo.
    echo 请将上面的错误信息截图发给我。
    echo.
    echo 按任意键退出...
    pause >nul
)
