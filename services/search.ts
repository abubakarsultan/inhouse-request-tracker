export function filterRequests(data:any[],query:string){
return data.filter(x=>JSON.stringify(x).toLowerCase().includes(query.toLowerCase()))
}
