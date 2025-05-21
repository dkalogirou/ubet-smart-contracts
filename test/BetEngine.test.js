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

  // --- Tests for matchBet ---
  describe("matchBet", function () {
    // Setup: Place a bet before each test in this block
    beforeEach(async function () {
      // Place a bet as addr1
      const marketId = 1;
      const odds = 250; // 2.5x odds
      const creatorStake = ethers.utils.parseEther("1.0"); // 1 ETH
      
      await betEngine.connect(addr1).placeBet(marketId, odds, { value: creatorStake });
      // Now betId 1 exists and is ready to be matched
    });

    it("Should allow a user to match a bet successfully", async function () {
      const betId = 1;
      // Get the bet to calculate expected matcher stake
      const bet = await betEngine.bets(betId);
      
      // Calculate expected matcher stake: creatorStake * (odds - 100) / 100
      // For odds 250 (2.5x) and stake 1 ETH, matcher needs to provide 1.5 ETH
      const expectedMatcherStake = bet.creatorStake.mul(bet.odds.sub(100)).div(100);
      
      // Match the bet and check for the event
      await expect(betEngine.connect(addr2).matchBet(betId, { value: expectedMatcherStake }))
        .to.emit(betEngine, "BetMatched")
        .withArgs(betId, addr1.address, addr2.address, bet.creatorStake, expectedMatcherStake, bet.odds);

      // Verify the bet was updated correctly
      const updatedBet = await betEngine.bets(betId);
      expect(updatedBet.matcher).to.equal(addr2.address);
      expect(updatedBet.matcherStake).to.equal(expectedMatcherStake);
      expect(updatedBet.status).to.equal(1); // 1 = BetStatus.Matched
    });

    it("Should fail if bet does not exist", async function () {
      const nonExistentBetId = 999;
      const someValue = ethers.utils.parseEther("1.0");
      
      await expect(
        betEngine.connect(addr2).matchBet(nonExistentBetId, { value: someValue })
      ).to.be.revertedWith("Bet does not exist");
    });

    it("Should fail if bet is not in Unmatched status", async function () {
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const expectedMatcherStake = bet.creatorStake.mul(bet.odds.sub(100)).div(100);
      
      // First, match the bet successfully
      await betEngine.connect(addr2).matchBet(betId, { value: expectedMatcherStake });
      
      // Now try to match it again
      await expect(
        betEngine.connect(addrs[0]).matchBet(betId, { value: expectedMatcherStake })
      ).to.be.revertedWith("Bet is not available for matching");
    });

    it("Should fail if matcher is the creator", async function () {
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const expectedMatcherStake = bet.creatorStake.mul(bet.odds.sub(100)).div(100);
      
      // Try to match own bet
      await expect(
        betEngine.connect(addr1).matchBet(betId, { value: expectedMatcherStake })
      ).to.be.revertedWith("Cannot match your own bet");
    });

    it("Should fail if matcher sends incorrect stake amount", async function () {
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const expectedMatcherStake = bet.creatorStake.mul(bet.odds.sub(100)).div(100);
      const incorrectStake = expectedMatcherStake.add(ethers.utils.parseEther("0.1")); // Too much
      
      await expect(
        betEngine.connect(addr2).matchBet(betId, { value: incorrectStake })
      ).to.be.revertedWith("Incorrect stake amount from matcher");
      
      const tooLittleStake = expectedMatcherStake.sub(ethers.utils.parseEther("0.1")); // Too little
      
      await expect(
        betEngine.connect(addr2).matchBet(betId, { value: tooLittleStake })
      ).to.be.revertedWith("Incorrect stake amount from matcher");
    });
  });

  // --- Tests for resolveBet ---
  describe("resolveBet", function () {
    // Setup: Place and match a bet before each test in this block
    beforeEach(async function () {
      // Place a bet as addr1
      const marketId = 1;
      const odds = 250; // 2.5x odds
      const creatorStake = ethers.utils.parseEther("1.0"); // 1 ETH
      
      await betEngine.connect(addr1).placeBet(marketId, odds, { value: creatorStake });
      
      // Match the bet as addr2
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const matcherStake = bet.creatorStake.mul(bet.odds.sub(100)).div(100); // 1.5 ETH
      
      await betEngine.connect(addr2).matchBet(betId, { value: matcherStake });
      // Now betId 1 exists, is matched, and ready to be resolved
    });

    it("Should allow the owner to resolve a bet with creator as winner", async function () {
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const totalStake = bet.creatorStake.add(bet.matcherStake); // 1 ETH + 1.5 ETH = 2.5 ETH
      
      // Get creator's balance before resolution
      const creatorBalanceBefore = await ethers.provider.getBalance(addr1.address);
      
      // Resolve the bet with creator (addr1) as winner
      await expect(betEngine.connect(owner).resolveBet(betId, addr1.address))
        .to.emit(betEngine, "BetResolved")
        .withArgs(betId, addr1.address, addr2.address, totalStake, bet.marketId, bet.odds);
      
      // Verify the bet was updated correctly
      const updatedBet = await betEngine.bets(betId);
      expect(updatedBet.winner).to.equal(addr1.address);
      expect(updatedBet.status).to.equal(2); // 2 = BetStatus.Resolved
      
      // Verify the winner received the total stake
      const creatorBalanceAfter = await ethers.provider.getBalance(addr1.address);
      expect(creatorBalanceAfter.sub(creatorBalanceBefore)).to.equal(totalStake);
    });

    it("Should allow the owner to resolve a bet with matcher as winner", async function () {
      const betId = 1;
      const bet = await betEngine.bets(betId);
      const totalStake = bet.creatorStake.add(bet.matcherStake); // 1 ETH + 1.5 ETH = 2.5 ETH
      
      // Get matcher's balance before resolution
      const matcherBalanceBefore = await ethers.provider.getBalance(addr2.address);
      
      // Resolve the bet with matcher (addr2) as winner
      await expect(betEngine.connect(owner).resolveBet(betId, addr2.address))
        .to.emit(betEngine, "BetResolved")
        .withArgs(betId, addr2.address, addr1.address, totalStake, bet.marketId, bet.odds);
      
      // Verify the bet was updated correctly
      const updatedBet = await betEngine.bets(betId);
      expect(updatedBet.winner).to.equal(addr2.address);
      expect(updatedBet.status).to.equal(2); // 2 = BetStatus.Resolved
      
      // Verify the winner received the total stake
      const matcherBalanceAfter = await ethers.provider.getBalance(addr2.address);
      expect(matcherBalanceAfter.sub(matcherBalanceBefore)).to.equal(totalStake);
    });

    it("Should fail if caller is not the owner", async function () {
      const betId = 1;
      
      // Try to resolve as non-owner (addr3)
      await expect(
        betEngine.connect(addrs[0]).resolveBet(betId, addr1.address)
      ).to.be.revertedWith("Caller is not the owner");
    });

    it("Should fail if bet does not exist", async function () {
      const nonExistentBetId = 999;
      
      await expect(
        betEngine.connect(owner).resolveBet(nonExistentBetId, addr1.address)
      ).to.be.revertedWith("Bet does not exist");
    });

    it("Should fail if bet is not in Matched status", async function () {
      // First, resolve the bet successfully
      const betId = 1;
      await betEngine.connect(owner).resolveBet(betId, addr1.address);
      
      // Now try to resolve it again
      await expect(
        betEngine.connect(owner).resolveBet(betId, addr1.address)
      ).to.be.revertedWith("Bet is not matched or already resolved/cancelled");
    });

    it("Should fail if winner is neither creator nor matcher", async function () {
      const betId = 1;
      const randomAddress = addrs[0].address; // Neither creator nor matcher
      
      await expect(
        betEngine.connect(owner).resolveBet(betId, randomAddress)
      ).to.be.revertedWith("Winner must be one of the participants");
    });
  });
});
