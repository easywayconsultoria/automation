CREATE POLICY "users read own workspace memberships"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
