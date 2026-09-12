export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  contact_id: string | null;
  status: "open" | "pending" | "closed";
  assigned_agent_id: string | null;
  updated_at: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

export interface InternalNote {
  id: string;
  conversation_id: string;
  agent_id: string | null;
  body: string;
  created_at: string;
}

export interface Contact {
  id: string;
  phone_number: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sender_type: "customer" | "agent" | "system";
  sender_id: string | null;
  whatsapp_msg_id: string | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}

export interface Pipeline {
  id: string;
  name: string;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  order_weight: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  currency: string;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealWithContact extends Deal {
  contact: Pick<Contact, "id" | "phone_number" | "first_name" | "last_name"> | null;
}

export type TriggerType = "new_contact" | "keyword" | "conversation_idle";
export type ActionType = "apply_tag" | "assign_agent" | "send_message" | "move_stage";

export interface Automation {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Broadcast {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  variable_mapping: Record<string, string>;
  segment_tag: string | null;
  scheduled_at: string | null;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed";
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  contact_id: string | null;
  phone: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  whatsapp_msg_id: string | null;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  status: "success" | "error" | "skipped";
  detail: string | null;
  created_at: string;
}
