import { useState } from "react";
import { Bell, Check, CheckCheck, UserRoundCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      setLocation(notification.link);
      setOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "candidate_status_change":
        return <UserRoundCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />;
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return "";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl bg-[#ffffff]"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5 stroke-primary" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 backdrop-blur-xl bg-white/90 dark:bg-black/80 border border-white/30 dark:border-white/10 shadow-lg rounded-2xl"
        align="end"
        data-testid="notifications-dropdown"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center" data-testid="empty-notifications">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" strokeWidth={1} />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.slice(0, 10).map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 hover-elevate transition-colors ${
                    !notification.isRead
                      ? "bg-primary/5 dark:bg-primary/10"
                      : ""
                  }`}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm line-clamp-2 ${
                            !notification.isRead
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {notification.message || notification.title}
                        </p>
                        {!notification.isRead && (
                          <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {notifications.length > 10 && (
          <div className="px-4 py-2 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground">
              +{notifications.length - 10} more notifications
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
