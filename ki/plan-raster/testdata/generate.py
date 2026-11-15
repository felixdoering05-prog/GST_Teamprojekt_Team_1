"""Entirely synthetic fixture corpus, generated for this prototype; CC0-1.0."""
import json
from pathlib import Path
import cv2,numpy as np
ROOT=Path(__file__).parent

def generate():
    truth=[]
    for name,kind in [('clean','plain'),('door','door'),('window','window'),('noise','noise'),('rotation','rotation'),('perspective','perspective'),('thin-lines','thin')]:
        im=np.full((500,720,3),255,np.uint8);t=1 if kind=='thin' else 17
        walls=[[[100,100],[600,100]],[[600,100],[600,400]],[[600,400],[100,400]],[[100,400],[100,100]],[[350,100],[350,400]]]
        for a,b in walls:cv2.line(im,a,b,(0,0,0),t)
        doors=[];windows=[]
        if kind=='door':
            cv2.line(im,(350,210),(350,255),(255,255,255),t+4)
            cv2.ellipse(im,(350,210),(45,45),0,0,90,(0,0,0),2)
            cv2.line(im,(350,210),(395,210),(0,0,0),2);doors=[[350,232.5]]
        if kind=='window':
            cv2.line(im,(600,190),(600,235),(255,255,255),t+4)
            for x in [597,603]:cv2.line(im,(x,181),(x,244),(0,0,0),1)
            windows=[[600,212.5]]
        cv2.putText(im,'ROOM A',(150,190),cv2.FONT_HERSHEY_SIMPLEX,.6,(0,0,0),1)
        cv2.putText(im,'10000 mm',(270,60),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,0),1)
        cv2.line(im,(100,75),(600,75),(0,0,0),1)
        matrix=np.eye(3)
        if kind=='noise':
            rng=np.random.default_rng(1201);im=np.uint8(np.clip(im.astype(float)+rng.normal(0,12,im.shape),0,255))
        if kind=='rotation':
            matrix=np.vstack([cv2.getRotationMatrix2D((360,250),7,1),[0,0,1]])
            im=cv2.warpPerspective(im,matrix,(720,500),borderValue=(255,255,255))
        if kind=='perspective':
            matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[719,0],[719,499],[0,499]]),np.float32([[45,35],[660,5],[700,460],[10,485]]))
            im=cv2.warpPerspective(im,matrix,(720,500),borderValue=(70,70,70))
        cv2.imwrite(str(ROOT/(name+'.png')),im)
        truth.append(dict(name=name,image=name+'.png',walls=walls,doors=doors,windows=windows,rooms=2,mm_per_original_px=20,image_transform=matrix.tolist(),reference=[[100,100],[600,100]],reference_mm=10000))
    (ROOT/'expected.json').write_text(json.dumps(truth,indent=2)+'\n')
if __name__=='__main__':generate()
