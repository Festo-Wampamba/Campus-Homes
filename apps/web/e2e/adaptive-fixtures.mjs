// Disposable, loopback-only UI data. No provider, storage or database writes.
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-11-09T06:00:00Z';
const permissions=['analytics.read','executive.read','office.read','office.manage','properties.read','bookings.manage_owned','roles.read','staff.read','audit.read'];
const property={id:id(1),name:'Kiwatule Gardens postgraduate residence and annex',catchment:'MUK',listingIntent:'manage_only',landlordId:id(9),hasLiveListing:false};
const semester={id:id(2),name:'Semester 1 · MUK · 2026/27'};
const roomType={id:id(3),propertyId:property.id,currentVersionId:id(4),attachedRoomsCount:0,createdAt:stamp,currentVersion:{id:id(4),roomTypeId:id(3),versionNumber:1,title:'Single room — garden-facing study suite',category:'single',bathroomType:'ensuite',capacity:1,description:'Quiet study room overlooking the garden.',amenities:['Reading desk','Chair'],semesterId:semester.id,pricePerTermUgx:1975000,depositUgx:200000,status:'approved',photos:[]}};
export function adaptiveSession(cookie='') {
 const role=/ch-local-test=(landlord|admin)/.exec(cookie)?.[1];
 if(!role)return null;
 return {user:{id:id(9),role:role==='admin'?'admin':'landlord',status:'active',name:'Namakula Kibirige · Kiwatule Gardens property operations',username:'kiwatule.operations',email:'operations@example.invalid',phone:null,contactPhone:'+256732152211',gender:'female'},access:{workspaces:[role],roles:[role==='admin'?'super_admin':'landlord'],permissions,onboarding:{student:false,landlord:false},assurance:{mfaVerified:true,authenticatedAt:stamp}}};
}
export function adaptiveResponse(p) {
 if(p==='/admin/access/me')return {permissions,assignments:[{roleKey:'super_admin',roleName:'Office Administrator / Front Desk and portfolio supervisor'}]};
 if(p==='/admin/overview')return {summary:Object.fromEntries(['totalUsers','activeUsers','newUsers30d','priorUsers30d','properties','verifiedListings','reservations','reservations30d','priorReservations30d','revenueUgx','revenue30dUgx','priorRevenue30dUgx','pendingKyc','pendingVisits','pendingRoomChanges','pendingRefunds','failedNotifications'].map((key,i)=>[key,key.includes('revenue')?873264500:137+i])),growth:[],reservationStatus:[],recentActivity:[],meta:{asOf:stamp,source:'Disposable local UI fixtures',grain:'test'}};
 if(p==='/admin/leadership')return {properties:[{catchment:'MUK',properties:37,active:28}],beds:621,reserved:13,booked:51,occupied:329,recordedCollectionsUgx:873264500,office:{open:27,escalated:6},catchments:['MUK'],asOf:stamp};
 if(p==='/admin/governance')return [];
 if(p==='/admin/office')return {rows:[],catchments:['MUK'],manageCatchments:['MUK'],supervise:true,asOf:stamp};
 if(p==='/landlords/me')return {userId:id(9),kycStatus:'verified'};
 if(p==='/listings/properties/mine')return [property];
 if(p==='/listings/semesters')return [semester];
 if(p==='/room-management')return {property,properties:[property],currentSemester:semester,semesters:[semester],summary:{totalRooms:0,totalBeds:0,availableBeds:0,partiallyOccupiedRooms:0,fullyOccupiedRooms:0,blockedRooms:0},changeSet:null,rooms:[],roomTypes:[roomType]};
 if(p==='/reservations/landlord-tenants')return [{reservationId:id(6),bedId:id(7),status:'booked',propertyId:property.id,propertyName:property.name,unitId:id(8),roomLabel:'Garden annex A02',bedLabel:'Bed 1',name:'Nantongo Nabirye',phone:null,email:null,emergencyContactName:null,emergencyContactPhone:null,totalUgx:1975000,paidUgx:230000,balanceUgx:1745000}];
 if(p==='/reservations/walk-in-beds')return [{id:id(7),propertyId:property.id,unitId:id(8),propertyName:property.name,roomLabel:'Garden annex A03',bedLabel:'Bed 1',roomCategory:'single',selfContained:true,pricePerTermUgx:1975000,semesterId:semester.id,semesterName:semester.name}];
 return undefined;
}
