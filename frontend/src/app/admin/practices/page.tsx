import * as practiceService from "@/lib/services/practice.service";
import { PracticesView } from "./practices-view";

export default async function AdminPracticesPage() {
  const practices = await practiceService.listPractices();

  return <PracticesView initialPractices={practices} />;
}
