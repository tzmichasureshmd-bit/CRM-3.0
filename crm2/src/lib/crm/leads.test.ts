import type { Deal, PipelineStage } from '@/types';
import { describe, expect, it } from 'vitest';
import {
  dealProgression,
  leadStatusForDeal,
  leadStatusForMilestone,
  stageMilestone,
} from './leads';

function stage(id: string, name: string): PipelineStage {
  return { id, name } as PipelineStage;
}

function dealWithStage(stageId: string): Deal {
  return { id: 'deal-1', stage_id: stageId } as Deal;
}

describe('stageMilestone', () => {
  it('matches the well-known milestones regardless of case or padding', () => {
    expect(stageMilestone(stage('s1', 'New Lead'))).toBe('new');
    expect(stageMilestone(stage('s2', '  contacted '))).toBe('contacted');
    expect(stageMilestone(stage('s3', 'Qualified'))).toBe('qualified');
    expect(stageMilestone(stage('s4', 'Proposal Sent'))).toBe('proposal');
    expect(stageMilestone(stage('s5', 'Negotiation'))).toBe('negotiation');
    expect(stageMilestone(stage('s6', 'Closed Won'))).toBe('won');
    expect(stageMilestone(stage('s7', 'closed lost'))).toBe('lost');
  });

  it('returns null for custom or empty stage names', () => {
    expect(stageMilestone(stage('s8', 'Discovery'))).toBeNull();
    expect(stageMilestone(stage('s9', ''))).toBeNull();
    expect(stageMilestone(stage('s10', '   '))).toBeNull();
  });
});

describe('leadStatusForMilestone', () => {
  it('maps every progression step onto the shared vocabulary', () => {
    expect(leadStatusForMilestone('new')).toBe('new');
    expect(leadStatusForMilestone('contacted')).toBe('contacted');
    expect(leadStatusForMilestone('engaged')).toBe('contacted');
    expect(leadStatusForMilestone('qualified')).toBe('qualified');
    expect(leadStatusForMilestone('proposal')).toBe('proposal');
    expect(leadStatusForMilestone('negotiation')).toBe('negotiation');
    expect(leadStatusForMilestone('won')).toBe('won');
    expect(leadStatusForMilestone('lost')).toBe('lost');
  });

  it('returns null when the stage carries no milestone', () => {
    expect(leadStatusForMilestone(null)).toBeNull();
  });
});

describe('leadStatusForDeal', () => {
  const stages = [
    stage('s1', 'New Lead'),
    stage('s2', 'Qualified'),
    stage('s3', 'Proposal Sent'),
    stage('s4', 'Custom Step'),
    stage('s5', 'Closed Won'),
  ];

  it('derives the status from the deal’s current stage', () => {
    expect(leadStatusForDeal(dealWithStage('s2'), stages)).toBe('qualified');
    expect(leadStatusForDeal(dealWithStage('s3'), stages)).toBe('proposal');
    expect(leadStatusForDeal(dealWithStage('s5'), stages)).toBe('won');
  });

  it('returns null when nothing can be guessed', () => {
    expect(leadStatusForDeal(dealWithStage('s4'), stages)).toBeNull();
    expect(leadStatusForDeal(dealWithStage('missing'), stages)).toBeNull();
    expect(dealProgression(dealWithStage('missing'), stages)).toBeNull();
  });
});
