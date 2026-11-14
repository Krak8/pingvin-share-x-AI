import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

type Metric = {
  name: string;
  help: string;
  type: "gauge" | "counter";
  value: number;
  labels?: Record<string, string>;
};

const EPOCH = new Date(0);

/**
 * Renders metrics in the Prometheus text exposition format. Only aggregated
 * numbers are exposed, never anything about individual shares or users.
 */
@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  async render(version: string): Promise<string> {
    const now = new Date();
    const activeShares = {
      uploadLocked: true,
      OR: [{ expiration: { gt: now } }, { expiration: EPOCH }],
    };

    const [
      users,
      shares,
      expiredShares,
      files,
      reverseShares,
      apiTokens,
      views,
      storage,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.share.count({ where: activeShares }),
      this.prisma.share.count({
        where: { uploadLocked: true, expiration: { lte: now, not: EPOCH } },
      }),
      this.prisma.file.count({ where: { share: activeShares } }),
      this.prisma.reverseShare.count({
        where: { shareExpiration: { gt: now } },
      }),
      this.prisma.apiToken.count(),
      this.prisma.share.aggregate({ _sum: { views: true } }),
      // File sizes are stored as strings, so they are summed up by the database
      this.prisma.$queryRaw<{ total: number | bigint | null }[]>`
        SELECT SUM(CAST("File"."size" AS INTEGER)) AS total FROM "File"
        JOIN "Share" ON "Share"."id" = "File"."shareId"
        WHERE "Share"."uploadLocked" = 1
          AND ("Share"."expiration" > ${now.getTime()} OR "Share"."expiration" = ${EPOCH.getTime()})`,
    ]);

    const metrics: Metric[] = [
      {
        name: "pingvin_users",
        help: "Number of registered users",
        type: "gauge",
        value: users,
      },
      {
        name: "pingvin_shares_active",
        help: "Number of active shares",
        type: "gauge",
        value: shares,
      },
      {
        name: "pingvin_shares_expired",
        help: "Number of expired shares not yet cleaned up",
        type: "gauge",
        value: expiredShares,
      },
      {
        name: "pingvin_files_active",
        help: "Number of files in active shares",
        type: "gauge",
        value: files,
      },
      {
        name: "pingvin_storage_bytes",
        help: "Total size of files in active shares",
        type: "gauge",
        value: Number(storage[0]?.total ?? 0),
      },
      {
        name: "pingvin_reverse_shares_active",
        help: "Number of active reverse shares",
        type: "gauge",
        value: reverseShares,
      },
      {
        name: "pingvin_api_tokens",
        help: "Number of API tokens",
        type: "gauge",
        value: apiTokens,
      },
      {
        name: "pingvin_share_views_total",
        help: "Total share views",
        type: "counter",
        value: views._sum.views ?? 0,
      },
      {
        name: "pingvin_build_info",
        help: "Version of Pingvin Share X",
        type: "gauge",
        value: 1,
        labels: { version },
      },
      {
        name: "process_uptime_seconds",
        help: "Process uptime",
        type: "gauge",
        value: Math.floor(process.uptime()),
      },
      {
        name: "process_resident_memory_bytes",
        help: "Resident memory size",
        type: "gauge",
        value: process.memoryUsage().rss,
      },
    ];

    return (
      metrics
        .map((m) => {
          const labels = m.labels
            ? `{${Object.entries(m.labels)
                .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, "")}"`)
                .join(",")}}`
            : "";
          return `# HELP ${m.name} ${m.help}\n# TYPE ${m.name} ${m.type}\n${m.name}${labels} ${m.value}`;
        })
        .join("\n") + "\n"
    );
  }
}
