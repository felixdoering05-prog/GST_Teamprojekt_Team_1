// ESP32-S3, Arduino-ESP32. Local credentials are never committed.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include <time.h>
#include "secrets.h"

unsigned long nextSend=0;
String pending;
String uuid(){char b[37];uint8_t x[16];esp_fill_random(x,16);x[6]=(x[6]&15)|64;x[8]=(x[8]&63)|128;snprintf(b,sizeof(b),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",x[0],x[1],x[2],x[3],x[4],x[5],x[6],x[7],x[8],x[9],x[10],x[11],x[12],x[13],x[14],x[15]);return String(b);}
void setup(){Serial.begin(115200);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);WiFi.setAutoReconnect(true);configTime(0,0,"pool.ntp.org","time.cloudflare.com");Serial.println("D21 ESP32-S3: SIMULIERTE Sensorwerte, keine Messung.");}
void loop(){
 delay(50);if((long)(millis()-nextSend)<0)return;nextSend=millis()+60000;
 if(WiFi.status()!=WL_CONNECTED){Serial.println("WLAN nicht verbunden");return;}
 if(time(nullptr)<1700000000){Serial.println("Warte auf NTP fuer TLS-Zertifikatspruefung");return;}
 if(pending.length()==0){float phase=millis()/600000.0;float t=22+1.5*sin(phase),h=48+8*sin(phase*.7),co2=700+200*sin(phase*.5);pending="{\"request_key\":\""+uuid()+"\",\"temperature\":"+String(t,1)+",\"humidity\":"+String(h,1)+",\"co2\":"+String(co2,0)+"}";}
 WiFiClientSecure client;client.setCACert(SERVER_ROOT_CA);HTTPClient http;http.setTimeout(12000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
 if(!http.begin(client,INPUT_URL)){Serial.println("HTTPS-Konfiguration ungueltig");return;}
 http.addHeader("Content-Type","application/json");http.addHeader("X-D21-Device",DEVICE_TOKEN);
 int code=http.POST(pending);http.end();Serial.printf("Simulation: HTTP %d\n",code);
 if(code==200||code==201)pending="";
 // Same packet/key is retained for retry; never print credentials or response bodies.
}
