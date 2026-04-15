import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/auditLog";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import {
  cancelRevenueCatWebBillingSubscription,
  deleteRevenueCatCustomer,
  listRevenueCatSubscriptions,
  RevenueCatApiError
} from "@/lib/revenuecatServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/notify";
import { buildAccountDeletedEmail } from "@/lib/emailTemplates";

const LEAD_PHOTO_BUCKET = "lead-photos";
const LEAD_PHOTO_PAGE_SIZE = 1000;
const STORAGE_REMOVE_BATCH_SIZE = 100;
const ACTIVE_STRIPE_STATUSES = ["active", "trialing"];
const APP_STORE_STORES = new Set(["app_store", "mac_app_store"]);
const BLOCKING_APP_STORE_AUTO_RENEWAL_STATUSES = new Set([
  "will_renew",
  "has_already_renewed",
  "will_change_product"
]);

async function getOrganizationMemberUserIds(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  const { data: memberships, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId);

  if (error) {
    throw error;
  }

  return (memberships ?? [])
    .map((membership) => membership.user_id as string | null)
    .filter((value): value is string => Boolean(value));
}

async function getOrganizationPlan(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  const { data: organization, error } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .single();

  if (error) {
    throw error;
  }

  return (organization.plan as string | null) ?? null;
}

async function getLeadPhotoPaths(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  const paths: string[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("lead_photos")
      .select("storage_path")
      .eq("org_id", orgId)
      .range(from, from + LEAD_PHOTO_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const batch = (data ?? [])
      .map((photo) => photo.storage_path as string | null)
      .filter((value): value is string => Boolean(value));

    paths.push(...batch);

    if (batch.length < LEAD_PHOTO_PAGE_SIZE) {
      break;
    }

    from += LEAD_PHOTO_PAGE_SIZE;
  }

  return paths;
}

async function removeLeadPhotoBlobs(
  admin: ReturnType<typeof createAdminClient>,
  storagePaths: string[]
) {
  for (let index = 0; index < storagePaths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = storagePaths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await admin.storage.from(LEAD_PHOTO_BUCKET).remove(batch);

    if (error) {
      throw error;
    }
  }
}

async function cancelStripeSubscriptions(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
) {
  if (userIds.length === 0) {
    return [];
  }

  const { data: subscriptions, error } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .in("user_id", userIds)
    .in("status", ACTIVE_STRIPE_STATUSES);

  if (error) {
    throw error;
  }

  const stripeSubscriptionIds = Array.from(
    new Set(
      (subscriptions ?? [])
        .map((subscription) => subscription.stripe_subscription_id as string | null)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (stripeSubscriptionIds.length === 0) {
    return [];
  }

  const stripe = getStripe();

  for (const stripeSubscriptionId of stripeSubscriptionIds) {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  }

  return stripeSubscriptionIds;
}

async function getRevenueCatHistoryCount(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  const { count, error } = await admin
    .from("iap_subscription_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function findBlockingAppStoreSubscription(
  subscriptions: Awaited<ReturnType<typeof listRevenueCatSubscriptions>>
) {
  return subscriptions.find((subscription) => {
    if (!subscription.givesAccess) {
      return false;
    }

    if (!APP_STORE_STORES.has((subscription.store ?? "").toLowerCase())) {
      return false;
    }

    return BLOCKING_APP_STORE_AUTO_RENEWAL_STATUSES.has(
      (subscription.autoRenewalStatus ?? "").toLowerCase()
    );
  });
}

export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();

    // 1. Look up the user's email for audit + confirmation email
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(auth.userId);
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Unable to retrieve user." },
        { status: 500 }
      );
    }
    const userEmail = userData.user.email;

    if (auth.role === "OWNER") {
      // Owner deletion: tear down the whole organization.
      const [memberUserIds, leadPhotoPaths, currentPlan, revenueCatHistoryCount] =
        await Promise.all([
          getOrganizationMemberUserIds(admin, auth.orgId),
          getLeadPhotoPaths(admin, auth.orgId),
          getOrganizationPlan(admin, auth.orgId),
          getRevenueCatHistoryCount(admin, auth.orgId)
        ]);

      const hasRevenueCatHistory = revenueCatHistoryCount > 0;
      let revenueCatSubscriptions: Awaited<ReturnType<typeof listRevenueCatSubscriptions>> = [];

      if (hasRevenueCatHistory || currentPlan !== "SOLO") {
        try {
          revenueCatSubscriptions = await listRevenueCatSubscriptions(auth.orgId);
        } catch (error) {
          const isMissingRevenueCatConfig =
            error instanceof Error &&
            error.message.includes("Missing REVENUECAT_PROJECT_ID or REVENUECAT_SECRET_KEY");

          if (isMissingRevenueCatConfig && (hasRevenueCatHistory || currentPlan !== "SOLO")) {
            return NextResponse.json(
              {
                error:
                  "RevenueCat cleanup is not configured. Add REVENUECAT_PROJECT_ID and REVENUECAT_SECRET_KEY before deleting this account."
              },
              { status: 500 }
            );
          }

          throw error;
        }
      }

      const blockingAppStoreSubscription = findBlockingAppStoreSubscription(revenueCatSubscriptions);
      if (blockingAppStoreSubscription) {
        return NextResponse.json(
          {
            error:
              "Cancel your App Store subscription before deleting your account.",
            managementUrl: blockingAppStoreSubscription.managementUrl
          },
          { status: 409 }
        );
      }

      const stripeSubscriptionIds = await cancelStripeSubscriptions(admin, memberUserIds);

      if (leadPhotoPaths.length > 0) {
        await removeLeadPhotoBlobs(admin, leadPhotoPaths);
      }

      const webBillingSubscriptions = revenueCatSubscriptions.filter(
        (subscription) =>
          subscription.givesAccess &&
          (subscription.store ?? "").toLowerCase() === "rc_billing"
      );

      for (const subscription of webBillingSubscriptions) {
        await cancelRevenueCatWebBillingSubscription(subscription.id);
      }

      if (hasRevenueCatHistory) {
        try {
          await deleteRevenueCatCustomer(auth.orgId);
        } catch (error) {
          if (!(error instanceof RevenueCatApiError && error.statusCode === 404)) {
            throw error;
          }
        }
      }

      await admin.from("push_tokens").delete().eq("org_id", auth.orgId);

      // Audit log BEFORE the org cascade-delete (after which audit_log rows
      // for that org would also be cascade-deleted). We log to a separate
      // record-keeping note in metadata; the org row itself is gone after
      // step 4 so the FK cascade will clean up the audit row too — but the
      // log line in our server logs survives forever.
      await recordAudit(admin, {
        orgId: auth.orgId,
        action: "account.deleted",
        actorUserId: auth.userId,
        actorEmail: userEmail ?? null,
        metadata: {
          deleted_lead_photo_count: leadPhotoPaths.length,
          canceled_stripe_subscription_count: stripeSubscriptionIds.length,
          canceled_revenuecat_web_billing_count: webBillingSubscriptions.length,
          had_revenuecat_history: hasRevenueCatHistory
        }
      });

      const { error: orgDeleteError } = await admin
        .from("organizations")
        .delete()
        .eq("id", auth.orgId);

      if (orgDeleteError) {
        return NextResponse.json(
          { error: "Failed to delete organization." },
          { status: 500 }
        );
      }
    } else {
      // Member self-removal: keep the org intact, remove this user only.
      await admin
        .from("push_tokens")
        .delete()
        .eq("user_id", auth.userId);

      await recordAudit(admin, {
        orgId: auth.orgId,
        action: "member.self_removed",
        actorUserId: auth.userId,
        actorEmail: userEmail ?? null
      });

      const { error: membershipDeleteError } = await admin
        .from("organization_members")
        .delete()
        .eq("org_id", auth.orgId)
        .eq("user_id", auth.userId);

      if (membershipDeleteError) {
        return NextResponse.json(
          { error: "Failed to remove membership." },
          { status: 500 }
        );
      }
    }

    // Send deletion confirmation email (best-effort)
    if (userEmail) {
      try {
        const email = buildAccountDeletedEmail();
        await sendEmail({
          to: userEmail,
          subject: email.subject,
          html: email.html,
          text: email.text,
          sender: "noreply",
        });
      } catch {
        // Best-effort: don't block deletion if email fails
      }
    }

    // Finally, delete the auth user. This revokes all active sessions for
    // both owner and member flows.
    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(auth.userId);

    if (deleteUserError) {
      return NextResponse.json(
        { error: "Account data deleted but failed to remove auth user." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete account.",
      },
      { status: 500 }
    );
  }
}
