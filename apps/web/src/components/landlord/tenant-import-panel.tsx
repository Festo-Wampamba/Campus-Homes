"use client";

import { useRef, useState } from 'react';
import { DownloadIcon, UploadIcon } from '@radix-ui/react-icons';
import type { ImportedTenantRow } from '@campushomes/shared';
import { Button } from '@/components/ui/button';
import { api, apiErrorMessage } from '@/lib/api';

export function TenantImportPanel({capacity,disabled,onUse}:{capacity:number;disabled:boolean;onUse:(rows:ImportedTenantRow[])=>void}){
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false),[downloading,setDownloading]=useState<string|null>(null);
  const [rows,setRows]=useState<ImportedTenantRow[]|null>(null),[selected,setSelected]=useState<number[]>([]);
  const [error,setError]=useState<string|null>(null),[reviewed,setReviewed]=useState(false);
  async function download(format:'xlsx'|'csv'){
    setDownloading(format);setError(null);
    try{
      const response=await fetch(`/api/v1/reservations/tenant-import/template?format=${format}`,{credentials:'include'});
      if(!response.ok)throw new Error();
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');
      anchor.href=url;anchor.download=`campushomes-tenants-template.${format}`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError('Could not download the template. Try again.');}finally{setDownloading(null);}
  }
  async function read(file:File|undefined){
    if(!file)return;setRows(null);setError(null);setReviewed(false);
    const format=file.name.split('.').pop()?.toLowerCase();
    if(!format||!['xlsx','csv','pdf','docx'].includes(format)){setError('Choose Excel (.xlsx), CSV, PDF or Word (.docx). Save older .xls or .doc files in a supported format first.');return;}
    if(file.size>2*1024*1024){setError('Choose a file of 2 MB or less.');return;}
    setBusy(true);
    try{
      const result=await api<{rows:ImportedTenantRow[]}>(`/reservations/tenant-import/parse?format=${format}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
      setRows(result.rows);setSelected(result.rows.map((_,index)=>index));
    }catch(caught){setError(apiErrorMessage(caught,'Could not read the document. Use the template and try again.'));}
    finally{setBusy(false);}
  }
  const chosen=rows?.filter((_,index)=>selected.includes(index))??[];
  return <details className="min-w-0 rounded-lg border border-border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Import tenant records</summary>
    <div className="mt-4 space-y-4">
      <p className="max-w-prose text-sm text-muted-foreground">Upload Excel, CSV, a PDF text table or a Word table. Review the names, gender and money, then choose beds in the form. Nothing is saved during import.</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={disabled||busy||Boolean(downloading)} onClick={()=>download('xlsx')}><DownloadIcon aria-hidden/>{downloading==='xlsx'?'Downloading…':'Excel template'}</Button>
        <Button type="button" variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={disabled||busy||Boolean(downloading)} onClick={()=>download('csv')}><DownloadIcon aria-hidden/>{downloading==='csv'?'Downloading…':'CSV template'}</Button>
        <Button type="button" variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={disabled||busy} onClick={()=>input.current?.click()}><UploadIcon aria-hidden/>{busy?'Reading file…':'Upload records'}</Button>
        <input ref={input} type="file" accept=".xlsx,.csv,.pdf,.docx" aria-label="Tenant records file" hidden disabled={disabled||busy} onChange={(event)=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';void read(file);}}/>
      </div>
      <p className="text-xs text-muted-foreground">Up to 50 students and 2 MB per file. The Excel template has gender dropdowns. Pasted values are checked on import. Image-only PDFs need text conversion first.</p>
      {busy&&<p role="status" className="rounded-md bg-muted p-3 text-sm">Reading the table and preparing a preview…</p>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {rows&&<>
        <div className="max-h-80 max-w-full overflow-auto rounded-md border border-border" tabIndex={0} aria-label="Imported tenant preview">
          <table className="w-full text-left text-sm"><caption className="p-3 text-left font-semibold">{rows.length} extracted {rows.length===1?'student':'students'} · select the rows to use</caption>
            <thead className="bg-muted"><tr>{['Use','First name','Last name','Gender','Contact','Room','Amount paid (UGX)','Review notes'].map((label)=><th key={label} className="px-3 py-2 align-top font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{rows.map((row,index)=><tr key={row.rowNumber}>
              <td className="p-3"><input type="checkbox" aria-label={`Use document row ${row.rowNumber}`} checked={selected.includes(index)} disabled={disabled} onChange={(event)=>{setReviewed(false);setSelected((current)=>event.target.checked?[...current,index]:current.filter((item)=>item!==index));}}/></td>
              {[row.firstName,row.lastName,row.gender||'Not recorded',row.email||row.phone,`${row.propertyName} ${row.roomLabel} ${row.bedLabel}`.trim(),row.amountPaid||'0',row.warnings.join(' ')].map((value,col)=><td key={col} className={`max-w-64 break-words p-3 align-top ${col===5?'tabular-nums':''}`}>{value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} disabled={disabled} onChange={(event)=>setReviewed(event.target.checked)}/><span>I have checked the extracted names, gender and money. I will correct any flagged values and confirm beds in the form.</span></label>
        {chosen.length>capacity&&<p role="alert" className="text-sm text-destructive">There is space for {capacity} more students. Deselect rows or remove existing form entries.</p>}
        <Button type="button" variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={disabled||!reviewed||!chosen.length||chosen.length>capacity} onClick={()=>{onUse(chosen);setRows(null);setReviewed(false);}}>Use {chosen.length} {chosen.length===1?'row':'rows'} in form</Button>
      </>}
    </div>
  </details>;
}
