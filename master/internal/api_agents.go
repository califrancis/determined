package internal

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/determined-ai/determined/master/internal/sproto"
	"github.com/determined-ai/determined/master/pkg/actor"
	"github.com/determined-ai/determined/proto/pkg/apiv1"
)

func (a *apiServer) GetAgents(
	_ context.Context, req *apiv1.GetAgentsRequest,
) (resp *apiv1.GetAgentsResponse, err error) {
	switch {
	case sproto.UseAgentRM(a.m.system):
		err = a.ask(sproto.AgentsAddr, req, &resp)
	case sproto.UseK8sRM(a.m.system):
		err = a.ask(sproto.PodsAddr, req, &resp)
	default:
		err = status.Error(codes.NotFound, "cannot find agents or pods actor")
	}
	if err != nil {
		return nil, err
	}
	a.filter(&resp.Agents, func(i int) bool {
		v := resp.Agents[i]
		return req.Label == "" || v.Label == req.Label
	})
	a.sort(resp.Agents, req.OrderBy, req.SortBy, apiv1.GetAgentsRequest_SORT_BY_ID)
	return resp, a.paginate(&resp.Pagination, &resp.Agents, req.Offset, req.Limit)
}

func agentAddr(agentID string) actor.Address {
	return sproto.AgentsAddr.Child(agentID)
}

func slotAddr(agentID, slotID string) actor.Address {
	return sproto.AgentsAddr.Child(agentID).Child("slots").Child(slotID)
}

func (a *apiServer) GetAgent(
	_ context.Context, req *apiv1.GetAgentRequest) (resp *apiv1.GetAgentResponse, err error) {
	return resp, a.ask(agentAddr(req.AgentId), req, &resp)
}

func (a *apiServer) GetSlots(
	_ context.Context, req *apiv1.GetSlotsRequest) (resp *apiv1.GetSlotsResponse, err error) {
	return resp, a.ask(agentAddr(req.AgentId), req, &resp)
}

func (a *apiServer) GetSlot(
	_ context.Context, req *apiv1.GetSlotRequest) (resp *apiv1.GetSlotResponse, err error) {
	return resp, a.ask(slotAddr(req.AgentId, req.SlotId), req, &resp)
}

func (a *apiServer) EnableAgent(
	ctx context.Context, req *apiv1.EnableAgentRequest,
) (resp *apiv1.EnableAgentResponse, err error) {
	if err := userShouldBeAdmin(ctx, a); err != nil {
		return nil, err
	}
	return resp, a.ask(agentAddr(req.AgentId), req, &resp)
}

func (a *apiServer) DisableAgent(
	ctx context.Context, req *apiv1.DisableAgentRequest,
) (resp *apiv1.DisableAgentResponse, err error) {
	if err := userShouldBeAdmin(ctx, a); err != nil {
		return nil, err
	}
	return resp, a.ask(agentAddr(req.AgentId), req, &resp)
}

func (a *apiServer) EnableSlot(
	ctx context.Context, req *apiv1.EnableSlotRequest,
) (resp *apiv1.EnableSlotResponse, err error) {
	if err := userShouldBeAdmin(ctx, a); err != nil {
		return nil, err
	}
	return resp, a.ask(slotAddr(req.AgentId, req.SlotId), req, &resp)
}

func (a *apiServer) DisableSlot(
	ctx context.Context, req *apiv1.DisableSlotRequest,
) (resp *apiv1.DisableSlotResponse, err error) {
	if err := userShouldBeAdmin(ctx, a); err != nil {
		return nil, err
	}
	return resp, a.ask(slotAddr(req.AgentId, req.SlotId), req, &resp)
}
