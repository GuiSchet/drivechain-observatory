import { ObservatoryView } from "@/components/observatory-view";
import { notFound } from "next/navigation";
export default async function Page({params}:{params:Promise<{slot:string}>}) {const {slot}=await params;if(!/^\d+$/.test(slot)||Number(slot)>255)notFound();return <ObservatoryView slot={Number(slot)}/>;}
