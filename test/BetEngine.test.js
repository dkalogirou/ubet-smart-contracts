const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BetEngine", function () {
  let BetEngine;
  let betEngine;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    // Get the ContractFactory and Signers
    BetEngine = await ethers.getContractFactory("BetEngine");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy the contract
    betEngine = await BetEngine.deploy();
    await betEngine.deployed();
  });

  describe("placeBet", function () {
    it("Should allow a user to place a bet successfully", async function () {
      const marketId = 1;
      const odds = 200; // Represents 2.0 odds (x100)
      const stake = ethers.utils.parseEther("1.0"); // 1 ETH

      // Place a bet and check for the event
      await expect(betEngine.connect(addr1).placeBet(marketId, odds, { value: stake }))
        .to.emit(betEngine, "BetPlaced")
        .withArgs(1, addr1.address, marketId, stake, odds); // betId will be 1

      // Verify the bet was stored correctly
      const bet = await betEngine.bets(1);
      expect(bet.id).to.equal(1);
      expect(bet.creator).to.equal(addr1.address);
      expect(bet.matcher).to.equal(ethers.constants.AddressZero); // No matcher yet
      expect(bet.creatorStake).to.equal(stake);
      expect(bet.matcherStake).to.equal(0); // No matcher stake yet
      expect(bet.odds).to.equal(odds);
      expect(bet.marketId).to.equal(marketId);
      expect(bet.status).to.equal(0); // 0 = BetStatus.Unmatched
      expect(bet.winner).to.equal(ethers.constants.AddressZero); // No winner yet

      // Verify nextBetId was incremented
      expect(await betEngine.nextBetId()).to.equal(2);
    });

    it("Should fail if stake is zero", async function () {
      const marketId = 1;
      const odds = 200; // 2.0 odds
      const zeroStake = ethers.utils.parseEther("0"); // 0 ETH

      // Attempt to place a bet with zero stake
      await expect(
        betEngine.connect(addr1).placeBet(marketId, odds, { value: zeroStake })
      ).to.be.revertedWith("Bet amount must be greater than zero");
    });

    it("Should fail if marketId is zero", async function () {
      const marketId = 0; // Invalid market ID
      const odds = 200; // 2.0 odds
      const stake = ethers.utils.parseEther("1.0"); // 1 ETH

      // Attempt to place a bet with zero marketId
      await expect(
        betEngine.connect(addr1).placeBet(marketId, odds, { value: stake })
      ).to.be.revertedWith("Market ID cannot be zero");
    });

    it("Should fail if odds are not greater than 100", async function () {
      const marketId = 1;
      const invalidOdds = 100; // 1.0 odds (invalid, must be > 100)
      const stake = ethers.utils.parseEther("1.0"); // 1 ETH

      // Attempt to place a bet with invalid odds
      await expect(
        betEngine.connect(addr1).placeBet(marketId, invalidOdds, { value: stake })
      ).to.be.revertedWith("Odds must be greater than 1.0");
    });
  });
});
