import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !caller) throw new Error("Não autorizado");

    // Check admin role
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Apenas administradores podem criar usuários");

    const { email, displayName, phone, notes, weeklyCredits, active } = await req.json();

    if (!email || !displayName) {
      throw new Error("Email e nome são obrigatórios");
    }

    // Use service role to create user
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create user in auth (with a random password, user will set their own)
    const randomPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (createError) {
      if (createError.message.includes("already been registered")) {
        throw new Error("Este email já está cadastrado");
      }
      throw createError;
    }

    // Update profile with extra fields
    if (phone || notes || weeklyCredits !== undefined || active !== undefined) {
      const updates: Record<string, unknown> = {};
      if (phone) updates.phone = phone;
      if (notes) updates.notes = notes;
      if (weeklyCredits !== undefined) updates.weekly_credits = weeklyCredits;
      if (active !== undefined) updates.active = active;

      await adminClient
        .from("profiles")
        .update(updates)
        .eq("user_id", newUser.user!.id);
    }

    // Send password recovery email so user can set their password
    const { error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetError) {
      console.error("Failed to send recovery email:", resetError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user!.id,
        message: "Aluno criado e email de acesso enviado" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
