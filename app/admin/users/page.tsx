"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const { data, mutate, isLoading } = useSWR("/api/admin/users", fetcher);
  const users = (data || []).filter((u: any) =>
    u.email.toLowerCase().includes(query.toLowerCase()) || u.name.toLowerCase().includes(query.toLowerCase())
  );

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return "Starter";
      case "GROWTH":
      case "PREMIUM":
        return "Pro";
      case "ENTERPRISE":
        return "Enterprise";
      default:
        return plan || "None";
    }
  };

  const toggleAdmin = async (id: string, role: string) => {
    await fetch(`/api/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role: role === "ADMIN" ? "USER" : "ADMIN" }),
    });
    mutate();
  };

  return (
    <div className="space-y-4 px-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground">User management</h1>
        </div>
        <Input
          placeholder="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>
      <Card title="Users">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={users}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "email", label: "Email" },
              { key: "name", label: "Name" },
              { key: "role", label: "Role", render: (row: any) => <Badge>{row.role}</Badge> },
              {
                key: "plan",
                label: "Plan",
                render: (row: any) => formatPlan(row.subscriptions?.[0]?.plan),
              },
              {
                key: "actions",
                label: "Actions",
                render: (row: any) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => toggleAdmin(row.id, row.role)}>
                      {row.role === "ADMIN" ? "Remove admin" : "Make admin"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => fetch(`/api/admin/users/${row.id}/toggle`, { method: "POST" }).then(() => mutate())}>
                      {row.role === "DISABLED" ? "Enable" : "Disable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => fetch(`/api/admin/users/impersonate/${row.id}`, { method: "POST" })}>
                      Impersonate
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
