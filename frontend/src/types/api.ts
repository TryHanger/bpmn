export interface UserResponse {
  id: string
  email: string
  role: 'admin' | 'employee'
  employee_id: string | null
  company_id: string | null
}

export interface LoginRequest {
  phone: string
}

export interface UserCreateRequest {
  phone: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user?: UserResponse
}

export interface CompanyResponse {
  id: string
  name: string
}

export interface TemplateVersionRead {
  id: string
  template_id: string
  version: number
  deployment_id: string | null
  process_definition_id: string | null
  xml_template: string
  flowable_version: number | null
  status: 'DRAFT' | 'DEPLOYED' | 'ARCHIVED'
  created_at: string
}

export interface TemplateRead {
  id: string
  name: string
  process_definition_key: string
  status: 'DRAFT' | 'DEPLOYED'
  current_version_id: string | null
  schema_id: string | null
  versions: TemplateVersionRead[]
  created_at: string
  updated_at: string
}

export interface ProcessSchemaVariableRead {
  id: string
  name: string
  label: string
  type: string
  required: boolean
  readable_by_roles: string[]
  order_index: number
  role_id: string
}

export interface ProcessSchemaRoleRead {
  id: string
  role_name: string
  display_name: string
  order_index: number
  variables: ProcessSchemaVariableRead[]
}

export interface ProcessSchemaRead {
  id: string
  name: string
  description: string | null
  created_at: string
  roles: ProcessSchemaRoleRead[]
}

export interface TemplateListResponse {
  items: TemplateRead[]
  total: number
}

export interface TemplateVersionListResponse {
  items: TemplateVersionRead[]
}

export interface DeployTemplateResponse {
  template: TemplateRead
  version: TemplateVersionRead
}

export type TemplateResponse = TemplateRead

export interface RoleResponse {
  id: string
  name: string
  company_id: string
  flowable_group: string
  created_at: string
  updated_at: string
}

export interface EmployeeResponse {
  id: string
  name: string
  phone: string
  company_id: string
  role_id: string
  role_name: string
  flowable_group: string
  user_id: string | null
  temp_password: string | null
  created_at: string
  updated_at: string
}

export interface ProcessInstanceResponse {
  id: string
  name: string
  company_id: string
  flowable_process_instance_id: string
  process_definition_key: string
  process_definition_id: string
  business_key: string
  status: 'running' | 'completed' | 'rejected'
  started_by: string
  xml_template: string | null
  start_time: string
  completed_at: string | null
  created_at: string
  updated_at: string
  current_activities: string[]
}

export interface ProcessListResponse {
  items: ProcessInstanceResponse[]
  total: number
}

export interface ActivityStatus {
  activityId: string
  activityName: string | null
  activityType: string
  status: 'pending' | 'active' | 'completed' | 'rejected' | 'skipped' | 'interrupted'
  assignee: string | null
  startTime: string | null
  endTime: string | null
  durationInMillis: number | null
  calledProcessInstanceId: string | null
}

export interface ProcessVariable {
  name: string
  type: string
  value: unknown
}

export interface ChildInstance {
  activityId: string
  processInstanceId: string
  status: 'running' | 'completed' | 'terminated'
  processDefinitionName: string | null
  startTime: string | null
  endTime: string | null
}

export interface ProcessStateResponse {
  process_instance_id: string
  status: 'running' | 'completed' | 'terminated'
  activities: ActivityStatus[]
  variables: ProcessVariable[]
  child_instances: ChildInstance[]
}

export interface TaskRead {
  id: string
  assignee: string | null
  name: string | null
  createTime: string | null
  taskDefinitionKey: string | null
  processInstanceId: string | null
  processDefinitionId: string | null
  processName: string | null
  claimed: boolean | null
}

export interface TaskContextResponse {
  task: TaskRead
  schema: ProcessSchemaRead | null
  variables: Record<string, unknown>
}

export interface TaskBoardResponse {
  available: TaskRead[]
  claimed: TaskRead[]
}

export interface CompanyCreateInput {
  name: string
}

export interface RoleCreateInput {
  name: string
  company_id: string
  flowable_group: string
}

export interface EmployeeCreateInput {
  name: string
  phone: string
  company_id: string
  role_id: string
}

export interface ProcessVariableInput {
  name: string
  value: string | number | boolean
  type: 'string' | 'integer' | 'boolean'
}

export interface ProcessStartInput {
  process_definition_key: string
  name: string
  company_id: string
  variables: ProcessVariableInput[]
}

export interface TaskCompleteInput {
  outcome: 'approved' | 'rejected'
  variables?: ProcessVariableInput[]
}
