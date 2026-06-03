interface Env {
  D1DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  console.log("url", url)
  return new Response('Ok', { status: 200 });
};
