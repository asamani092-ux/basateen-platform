import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { stageLabel } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";
import { AdmissionForm, type AdmissionFormValues } from "./AdmissionForm";

type AppRow = {
  id: number;
  full_name_ar: string;
  phone: string;
  age: number | null;
  stage_id: number;
  school_grade: string;
  guardian_phone: string;
  status: string;
  created_at: string;
};

export function AdmissionFunnelTab() {
  const [items, setItems] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!getApiToken()) return;
    setLoading(true);
    try {
      const res = await api.gsApplications("pending");
      setItems(res.items as AppRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createApplication(values: AdmissionFormValues) {
    setSubmitting(true);
    try {
      await api.gsApplicationCreate({
        full_name_ar: values.full_name_ar.trim(),
        phone: values.phone.trim(),
        national_id: values.national_id.trim(),
        school_grade: values.school_grade.trim(),
        stage_id: Number(values.stage_id),
        guardian_phone: values.guardian_phone.trim(),
        guardian_national_id: values.guardian_national_id.trim() || null,
        guardian_work: values.guardian_work.trim() || null,
        health_notes: values.health_notes.trim() || null,
        age: values.age.trim() ? Number(values.age) : null,
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function accept(id: number) {
    setBusyId(id);
    try {
      await api.gsApplicationAccept(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    setBusyId(id);
    try {
      await api.gsApplicationReject(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>استمارة قبول طالب جديد</CardTitle>
          <CardDescription style={tajawal}>
            الحقول بعلامة * إلزامية — الاختيارية تُحفظ NULL دون إيقاف النظام
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdmissionForm onSubmit={createApplication} submitting={submitting} />
        </CardContent>
      </Card>

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>طابور الطلبات</CardTitle>
          <CardDescription style={tajawal}>
            قبول يوجّه الطالب لانتظار المشرف التعليمي للمرحلة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : items.length === 0 ? (
            <p className={ds.alert.info} style={tajawal}>
              لا توجد طلبات معلّقة حالياً.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[26%]`} style={tajawal}>
                      الاسم
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                      العمر
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                      الجوال
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                      المرحلة
                    </TableHead>
                    <TableHead className={ds.table.headActions} style={tajawal}>
                      إجراءات
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.full_name_ar}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.age ?? "—"}
                      </TableCell>
                      <TableCell className={`${ds.table.cell} font-mono`} dir="ltr">
                        {row.phone}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {stageLabel(row.stage_id)}
                      </TableCell>
                      <TableActionsCell>
                        <TableIconAction
                          kind="accept"
                          disabled={busyId === row.id}
                          onClick={() => accept(row.id)}
                        />
                        <TableIconAction
                          kind="reject"
                          disabled={busyId === row.id}
                          onClick={() => reject(row.id)}
                        />
                      </TableActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
