"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Users } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import Image from "next/image";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Users</h1>
        <p className="text-sm text-[var(--text-secondary)]">All registered clippers and admins.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="No users" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Discord ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user: any) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {user.image ? (
                      <Image src={user.image} alt="" width={24} height={24} className="rounded-full" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs text-accent">
                        {user.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-[var(--text-primary)]">{user.username}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{user.discordId}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "ADMIN" || user.role === "OWNER" ? "active" : "draft"}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === "ACTIVE" ? "active" : "rejected"}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatRelative(user.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
