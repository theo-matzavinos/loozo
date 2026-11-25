import { stringParam } from "@loozo/angular-router";
import { defineRoute } from "@loozo/angular-launch";
import { redirect } from "@loozo/angular-launch/server";
import { idSchema } from "../../../../todo-input.server";
import parent from "../../route";
import { destination as todo } from "../../todo/$id/destination.generated";

// A todo's old address: its resolver's call redirects to the todo, whose own call may then
// answer notFound(), so a page request can end at the not-found page after a redirect.
export default defineRoute("moved/$id", { parent, params: { id: stringParam } })
  .remote(({ query }) => ({
    moved: {
      find: query({
        input: idSchema,
        handler: ({ input }) => {
          throw redirect(todo, { params: { id: input.id } });
        },
      }),
    },
  }))
  .resolve({
    moved: ({ params, remote }) => remote.moved.find({ id: params.id }),
  });
