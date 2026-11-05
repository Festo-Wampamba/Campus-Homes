import { prepareRoomPhoto } from './room-photo-file';
it('recognizes a Windows PNG whose file picker omitted its MIME type',async()=>{
  const file=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'Bedroom.PNG',{type:''});
  const prepared=await prepareRoomPhoto(file);expect(prepared.type).toBe('image/png');expect(prepared.size).toBe(file.size);
});
it('rejects renamed non-images with an actionable error',async()=>{
  await expect(prepareRoomPhoto(new File(['not an image'],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow(/JPEG, PNG or WebP/);
});
it('accepts a JPEG signature even when MIME metadata is wrong',async()=>{
  expect((await prepareRoomPhoto(new File([new Uint8Array([255,216,255,0])],'room.jpg',{type:'application/octet-stream'}))).type).toBe('image/jpeg');
});
