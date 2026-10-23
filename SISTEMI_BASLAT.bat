@echo off
chcp 65001 >nul
title Profesyonel Online Ogrenci Kulup Secim Sistemi
echo ====================================================================
echo   PROFESYONEL ONLINE OGRENCI KULUP SECIM SISTEMI BASLATILIYOR...
echo ====================================================================
echo.
echo   Tarayiciniz otomatik olarak acilacaktir.
echo   Yonetici Paneli Kullanici Adi: admin
echo   Yonetici Paneli Sifresi:       123456
echo.
start "" "http://localhost:3000"
node server.js
pause
