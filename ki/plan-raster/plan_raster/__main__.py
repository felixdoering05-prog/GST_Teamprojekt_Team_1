import argparse,json,sys
from pathlib import Path
from .pipeline import extract

def main():
    p=argparse.ArgumentParser(description='Lokaler Raster-Grundrissprototyp')
    p.add_argument('input');p.add_argument('--out',required=True);p.add_argument('--scale',help='Originalpixel x1,y1,x2,y2,Länge_in_mm');p.add_argument('--debug-dir');p.add_argument('--no-perspective',action='store_true');p.add_argument('--method',choices=['classical','learned'],default='classical');p.add_argument('--ocr',action='store_true',help='Tesseract-Texte als Hinweise, niemals automatischer Maßstab')
    args=p.parse_args()
    try:
        result=extract(args.input,args.scale,args.debug_dir,not args.no_perspective,args.method)
        if args.ocr:
            try:
                import cv2,pytesseract
                text=pytesseract.image_to_string(cv2.imread(args.input),config='--psm 11',timeout=15)
                result['ocr_hints']=text[:4000]
                result['warnings'].append('OCR-Texte sind ungeprüfte Hinweise. Bemaßung einer Strecke zuordnen und mit --scale bestätigen.')
            except Exception:result['warnings'].append('OCR nicht verfügbar oder fehlgeschlagen; Tesseract separat installieren.')
        out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2,ensure_ascii=False,allow_nan=False)+'\n')
    except (ValueError,OSError) as e:p.exit(2,str(e)+'\n')
if __name__=='__main__':main()
